/**
 * Adaptation loops for offline and online ACE training.
 */

import { Playbook } from "./playbook";
import {
  Curator,
  CuratorOutput,
  Generator,
  GeneratorOutput,
  Reflector,
  ReflectorOutput,
} from "./roles";

export interface Sample {
  question: string;
  context?: string;
  groundTruth?: string;
  metadata?: Record<string, any>;
}

export interface EnvironmentResult {
  feedback: string;
  groundTruth?: string;
  metrics?: Record<string, number>;
}

export abstract class TaskEnvironment {
  abstract evaluate(
    sample: Sample,
    generatorOutput: GeneratorOutput
  ): Promise<EnvironmentResult>;
}

export interface AdapterStepResult {
  sample: Sample;
  generatorOutput: GeneratorOutput;
  environmentResult: EnvironmentResult;
  reflection: ReflectorOutput;
  curatorOutput: CuratorOutput;
  playbookSnapshot: string;
}

export class AdapterBase {
  public playbook: Playbook;
  private recentReflections: string[] = [];

  constructor(
    private generator: Generator,
    private reflector: Reflector,
    private curator: Curator,
    playbook?: Playbook,
    private maxRefinementRounds = 1,
    private reflectionWindow = 3
  ) {
    this.playbook = playbook || new Playbook();
  }

  private reflectionContext(): string {
    return this.recentReflections.join("\n---\n");
  }

  private updateRecentReflections(reflection: ReflectorOutput): void {
    const serialized = JSON.stringify(reflection.raw);
    this.recentReflections.push(serialized);
    if (this.recentReflections.length > this.reflectionWindow) {
      this.recentReflections = this.recentReflections.slice(
        -this.reflectionWindow
      );
    }
  }

  private applyBulletTags(reflection: ReflectorOutput): void {
    for (const tag of reflection.bulletTags) {
      try {
        this.playbook.tagBullet(tag.id, tag.tag);
      } catch (e) {
        continue;
      }
    }
  }

  private questionContext(
    sample: Sample,
    environmentResult: EnvironmentResult
  ): string {
    const parts = [
      `question: ${sample.question}`,
      `context: ${sample.context}`,
      `metadata: ${JSON.stringify(sample.metadata)}`,
      `feedback: ${environmentResult.feedback}`,
      `ground_truth: ${environmentResult.groundTruth}`,
    ];
    return parts.join("\n");
  }

  private progressString(
    epoch: number,
    totalEpochs: number,
    step: number,
    totalSteps: number
  ): string {
    return `epoch ${epoch}/${totalEpochs} · sample ${step}/${totalSteps}`;
  }

  protected async processSample(
    sample: Sample,
    environment: TaskEnvironment,
    epoch: number,
    totalEpochs: number,
    stepIndex: number,
    totalSteps: number
  ): Promise<AdapterStepResult> {
    const generatorOutput = await this.generator.generate(
      sample.question,
      sample.context,
      this.playbook,
      this.reflectionContext()
    );
    const envResult = await environment.evaluate(sample, generatorOutput);
    const reflection = await this.reflector.reflect(
      sample.question,
      generatorOutput,
      this.playbook,
      envResult.groundTruth,
      envResult.feedback,
      this.maxRefinementRounds
    );
    this.applyBulletTags(reflection);
    this.updateRecentReflections(reflection);
    const curatorOutput = await this.curator.curate(
      reflection,
      this.playbook,
      this.questionContext(sample, envResult),
      this.progressString(epoch, totalEpochs, stepIndex, totalSteps)
    );
    this.playbook.applyDelta(curatorOutput.delta);
    return {
      sample,
      generatorOutput,
      environmentResult: envResult,
      reflection,
      curatorOutput,
      playbookSnapshot: this.playbook.asPrompt(),
    };
  }
}

export class OfflineAdapter extends AdapterBase {
  async run(
    samples: Sample[],
    environment: TaskEnvironment,
    epochs = 1
  ): Promise<AdapterStepResult[]> {
    const results: AdapterStepResult[] = [];
    const totalSteps = samples.length;
    for (let epochIdx = 1; epochIdx <= epochs; epochIdx++) {
      for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
        const sample = samples[stepIdx];
        const result = await this.processSample(
          sample,
          environment,
          epochIdx,
          epochs,
          stepIdx + 1,
          totalSteps
        );
        results.push(result);
      }
    }
    return results;
  }
}

export class OnlineAdapter extends AdapterBase {
  async run(
    samples: Sample[],
    environment: TaskEnvironment
  ): Promise<AdapterStepResult[]> {
    const results: AdapterStepResult[] = [];
    let stepIdx = 0;
    for (const sample of samples) {
      stepIdx++;
      const result = await this.processSample(
        sample,
        environment,
        1,
        1,
        stepIdx,
        stepIdx
      );
      results.push(result);
    }
    return results;
  }
}
