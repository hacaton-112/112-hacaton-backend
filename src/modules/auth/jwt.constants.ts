/**
 * Single source for both sides of the token: signing and verification must
 * agree, and drift between them would reject every issued token.
 */
export const JWT_ALGORITHM = "HS256" as const;

export type JwtAlgorithm = typeof JWT_ALGORITHM;

/** Kept as one mutable array so the hot verification path allocates nothing. */
export const JWT_ALGORITHMS: JwtAlgorithm[] = [JWT_ALGORITHM];
