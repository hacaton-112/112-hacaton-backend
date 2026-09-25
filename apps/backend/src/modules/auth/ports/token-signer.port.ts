/** Signing half of the JWT library, kept separate from verification. */
export interface TokenSigner {
  signAsync(payload: object): Promise<string>;
}
