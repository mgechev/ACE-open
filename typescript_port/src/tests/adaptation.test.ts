jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  env: {
    allowLocalModels: false,
  },
}));

import {
  DummyLLMClient,
  Generator,
  Reflector,
  Curator,
  Playbook,
  OfflineAdapter,
  Sample,
  TaskEnvironment,
  EnvironmentResult,
  GeneratorOutput,
} from "../";

class SimpleQAEnvironment extends TaskEnvironment {
  async evaluate(
    sample: Sample,
    generatorOutput: GeneratorOutput
  ): Promise<EnvironmentResult> {
    const groundTruth = sample.groundTruth || "";
    const prediction = generatorOutput.finalAnswer;
    const correct =
      prediction.trim().toLowerCase() === groundTruth.trim().toLowerCase();
    const feedback = correct
      ? "correct"
      : `expected ${groundTruth} but got ${prediction}`;
    return {
      feedback,
      groundTruth,
      metrics: { accuracy: correct ? 1.0 : 0.0 },
    };
  }
}

describe("OfflineAdapter", () => {
  it("should update the playbook in a single step", async () => {
    const client = new DummyLLMClient();
    client.queue(
      JSON.stringify({
        reasoning: "The answer is given in the playbook.",
        bullet_ids: [],
        final_answer: "42",
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: "Prediction matches ground truth.",
        error_identification: "",
        root_cause_analysis: "",
        correct_approach: "Keep leveraging the playbook.",
        key_insight: "Store that 42 is the default answer.",
        bullet_tags: [],
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: "Adding a reminder for future tasks.",
        operations: [
          {
            type: "ADD",
            section: "default_answers",
            content:
              "If the question mentions life, universe, and everything, answer 42.",
            metadata: { helpful: 1 },
          },
        ],
      })
    );

    const playbook = new Playbook();
    const generator = new Generator(client);
    const reflector = new Reflector(client);
    const curator = new Curator(client);

    const adapter = new OfflineAdapter(
      generator,
      reflector,
      curator,
      playbook,
      1
    );

    const sample: Sample = {
      question: "What is the answer to life, the universe, and everything?",
      groundTruth: "42",
    };
    const environment = new SimpleQAEnvironment();
    const results = await adapter.run([sample], environment, 1);

    expect(results.length).toBe(1);
    expect(results[0].generatorOutput.finalAnswer).toBe("42");
    expect(playbook.stats()["sections"]).toBeGreaterThanOrEqual(1);
    expect(
      playbook.getBullets().some((bullet: import("../playbook").Bullet) => bullet.content.includes("life"))
    ).toBe(true);
  });
});
