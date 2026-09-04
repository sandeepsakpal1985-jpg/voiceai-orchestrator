export type AiGenerateInput = {
  system: string;
  userMessage: string;
  contextJson: string;
  maxOutputTokens: number;
};

export type AiGenerateResult = {
  text: string;
  model: string;
};

export interface AiProvider {
  readonly name: string;
  generateResponse(input: AiGenerateInput): Promise<AiGenerateResult>;
}
