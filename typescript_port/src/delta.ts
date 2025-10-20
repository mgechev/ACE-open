/**
 * Delta operations produced by the ACE Curator.
 */

export type OperationType = "ADD" | "UPDATE" | "TAG" | "REMOVE";

export interface DeltaOperation {
  type: OperationType;
  section: string;
  content?: string;
  bullet_id?: string;
  metadata: Record<string, number>;
}

export function fromJson(payload: Record<string, any>): DeltaOperation {
  return {
    type: payload["type"] as OperationType,
    section: payload["section"] || "",
    content: payload["content"] || undefined,
    bullet_id: payload["bullet_id"] || undefined,
    metadata: payload["metadata"] || {},
  };
}

export function toJson(op: DeltaOperation): Record<string, any> {
  const data: Record<string, any> = {
    type: op.type,
    section: op.section,
  };
  if (op.content) {
    data["content"] = op.content;
  }
  if (op.bullet_id) {
    data["bullet_id"] = op.bullet_id;
  }
  if (op.metadata) {
    data["metadata"] = op.metadata;
  }
  return data;
}

export interface DeltaBatch {
  reasoning: string;
  operations: DeltaOperation[];
}

export function deltaBatchFromJson(payload: Record<string, any>): DeltaBatch {
  const opsPayload = payload["operations"];
  const operations: DeltaOperation[] = [];
  if (Array.isArray(opsPayload)) {
    for (const item of opsPayload) {
      if (typeof item === "object") {
        operations.push(fromJson(item));
      }
    }
  }
  return {
    reasoning: payload["reasoning"] || "",
    operations,
  };
}

export function deltaBatchToJson(batch: DeltaBatch): Record<string, any> {
  return {
    reasoning: batch.reasoning,
    operations: batch.operations.map(toJson),
  };
}
