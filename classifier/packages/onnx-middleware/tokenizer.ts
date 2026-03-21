import { Tokenizer } from "@huggingface/tokenizers";
import * as path from "path";

export interface TokenizerOutput {
  input_ids: BigInt64Array;
  attention_mask: BigInt64Array;
}

export class HFTokenizer {
  private tokenizer: Tokenizer;
  private readonly maxLen: number;

  constructor(tokenizer: Tokenizer, maxLen: number) {
    this.tokenizer = tokenizer;
    this.maxLen = maxLen;
  }

  static async fromFile(tokenizerJsonPath: string, maxLen = 128): Promise<HFTokenizer> {
    const tokenizerJson = await Bun.file(tokenizerJsonPath).json();

    const dir = path.dirname(tokenizerJsonPath);
    let config: Record<string, unknown> = {};
    try {
      config = await Bun.file(path.join(dir, "tokenizer_config.json")).json();
    } catch {
      // tokenizer_config.json is optional
    }

    const tokenizer = new Tokenizer(tokenizerJson, config);
    return new HFTokenizer(tokenizer, maxLen);
  }

  encode(text: string): TokenizerOutput {
    const encoding = this.tokenizer.encode(text);
    const ids = encoding.ids;
    const mask = encoding.attention_mask;

    const input_ids = new BigInt64Array(this.maxLen).fill(0n);
    const attention_mask = new BigInt64Array(this.maxLen).fill(0n);

    const len = Math.min(ids.length, this.maxLen);
    for (let i = 0; i < len; i++) {
      input_ids[i] = BigInt(ids[i]!);
      attention_mask[i] = BigInt(mask[i]!);
    }

    return { input_ids, attention_mask };
  }
}
