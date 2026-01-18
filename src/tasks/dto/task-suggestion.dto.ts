export class TaskSuggestionDto {
  title: string;
  description: string;
  type: 'CREATE_MATCH' | 'MOVE_PLAYER' | 'OTHER';
  reason: string;
  payload?: Record<string, unknown>;
}
