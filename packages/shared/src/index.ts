export type UUID = string;

export interface AuditableEvent<TPayload = unknown> {
  id: UUID;
  occurredAt: Date;
  type: string;
  payload: TPayload;
}

export interface DomainError {
  code: string;
  message: string;
}
