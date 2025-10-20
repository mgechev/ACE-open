/**
 * Generator, Reflector, and Curator components.
 */

import { DeltaBatch, deltaBatchFromJson } from "./delta";
import { LLMClient } from "./llm";
import { Playbook } from "./playbook";
import {
  CURATOR_PROMPT,
  GENERATOR_PROMPT,
  REFLECTOR_PROMPT,
} from "./prompts";

function safeJsonLoads(text: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("LLM response is not valid JSON:", e);
    console.error("Offending text:", text);
    throw new Error(`LLM response is not valid JSON: ${e}\n${text}`);
  }
}

function formatOptional(value?: string): string {
  return value || "(none)";
}

export interface GeneratorOutput {
  reasoning: string;
  finalAnswer: string;
  bulletIds: string[];
  raw: Record<string, any>;
}

export class Generator {
  constructor(
    private llm: LLMClient,
    private promptTemplate: string = GENERATOR_PROMPT,
    private maxRetries: number = 3
  ) {}

  async generate(
    question: string,
    context: string | undefined,
    playbook: Playbook,
    reflection?: string,
    ...kwargs: any[]
  ): Promise<GeneratorOutput> {
    const basePrompt = this.promptTemplate
      .replace("{playbook}", playbook.asPrompt() || "(empty playbook)")
      .replace("{reflection}", formatOptional(reflection))
      .replace("{question}", question)
      .replace("{context}", formatOptional(context));

    let prompt = basePrompt;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const response = await this.llm.complete(prompt, ...kwargs);
      try {
        const data = safeJsonLoads(response.text);
        const reasoning = data["reasoning"] || "";
        const finalAnswer = data["final_answer"] || "";
        const bulletIds = (data["bullet_ids"] || []).map((item: any) =>
          String(item)
        );
        return {
          reasoning,
          finalAnswer,
          bulletIds,
          raw: data,
        };
      } catch (err: any) {
        lastError = err;
        if (attempt + 1 >= this.maxRetries) {
          break;
        }
        prompt = basePrompt + "\n\nMake sure to output only a single valid JSON object." +
"Please escape all quotes or use single quotes to avoid outputting extra text.";
      }
    }
    throw new Error(`Generator failed to produce valid JSON. ${lastError}`);
  }
}

export interface BulletTag {
  id: string;
  tag: string;
}

export interface ReflectorOutput {
  reasoning: string;
  errorIdentification: string;
  rootCauseAnalysis: string;
  correctApproach: string;
  keyInsight: string;
  bulletTags: BulletTag[];
  raw: Record<string, any>;
}

export class Reflector {
  constructor(
    private llm: LLMClient,
    private promptTemplate: string = REFLECTOR_PROMPT,
    private maxRetries: number = 3
  ) {}

  async reflect(
    question: string,
    generatorOutput: GeneratorOutput,
    playbook: Playbook,
    groundTruth: string | undefined,
    feedback: string | undefined,
    maxRefinementRounds = 1,
    ...kwargs: any[]
  ): Promise<ReflectorOutput> {
    const playbookExcerpt = makePlaybookExcerpt(
      playbook,
      generatorOutput.bulletIds
    );
    const basePrompt = this.promptTemplate
      .replace("{question}", question)
      .replace("{reasoning}", generatorOutput.reasoning)
      .replace("{prediction}", generatorOutput.finalAnswer)
      .replace("{ground_truth}", formatOptional(groundTruth))
      .replace("{feedback}", formatOptional(feedback))
      .replace(
        "{playbook_excerpt}",
        playbookExcerpt || "(no bullets referenced)"
      );

    let result: ReflectorOutput | undefined;
    let prompt = basePrompt;
    let lastError: Error | undefined;

    for (let roundIdx = 0; roundIdx < maxRefinementRounds; roundIdx++) {
      prompt = basePrompt;
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        const response = await this.llm.complete(prompt, {
          refinement_round: roundIdx,
          ...kwargs,
        });
        try {
          const data = safeJsonLoads(response.text);
          const bulletTags: BulletTag[] = [];
          const tagsPayload = data["bullet_tags"] || [];
          if (Array.isArray(tagsPayload)) {
            for (const item of tagsPayload) {
              if (typeof item === "object" && "id" in item && "tag" in item) {
                bulletTags.push({
                  id: String(item["id"]),
                  tag: String(item["tag"]).toLowerCase(),
                });
              }
            }
          }
          const candidate: ReflectorOutput = {
            reasoning: data["reasoning"] || "",
            errorIdentification: data["error_identification"] || "",
            rootCauseAnalysis: data["root_cause_analysis"] || "",
            correctApproach: data["correct_approach"] || "",
            keyInsight: data["key_insight"] || "",
            bulletTags,
            raw: data,
          };
          result = candidate;
          if (bulletTags.length > 0 || candidate.keyInsight) {
            return candidate;
          }
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt + 1 >= this.maxRetries) {
            break;
          }
          prompt = basePrompt + "\n\nPlease strictly output valid JSON, escape double quotes, " +
"Do not output additional explanatory text.";
        }
      }
    }
    if (!result) {
      throw new Error(`Reflector failed to produce a result. ${lastError}`);
    }
    return result;
  }
}

export interface CuratorOutput {
  delta: DeltaBatch;
  raw: Record<string, any>;
}

export class Curator {
  constructor(
    private llm: LLMClient,
    private promptTemplate: string = CURATOR_PROMPT,
    private maxRetries: number = 3
  ) {}

  async curate(
    reflection: ReflectorOutput,
    playbook: Playbook,
    questionContext: string,
    progress: string,
    ...kwargs: any[]
  ): Promise<CuratorOutput> {
    const basePrompt = this.promptTemplate
      .replace("{progress}", progress)
      .replace("{stats}", JSON.stringify(playbook.stats()))
      .replace("{reflection}", JSON.stringify(reflection.raw, null, 2))
      .replace("{playbook}", playbook.asPrompt() || "(empty playbook)")
      .replace("{question_context}", questionContext);

    let prompt = basePrompt;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const response = await this.llm.complete(prompt, ...kwargs);
      try {
        const data = safeJsonLoads(response.text);
        const delta = deltaBatchFromJson(data);
        return {
          delta,
          raw: data,
        };
      } catch (err: any) {
        lastError = err;
        if (attempt + 1 >= this.maxRetries) {
          break;
        }
        prompt =
          basePrompt +
          "\n\nReminder: Only output valid JSON. Please escape double quotes or use single quotes for all strings. " +
"Do not add extra text.";
      }
    }
    throw new Error(`Curator failed to produce valid JSON. ${lastError}`);
  }
}

function makePlaybookExcerpt(
  playbook: Playbook,
  bulletIds: string[]
): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const bulletId of bulletIds) {
    if (seen.has(bulletId)) {
      continue;
    }
    const bullet = playbook.getBullet(bulletId);
    if (bullet) {
      seen.add(bulletId);
      lines.push(`[${bullet.id}] ${bullet.content}`);
    }
  }
  return lines.join("\n");
}
