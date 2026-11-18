// Display older saved evidence using the current mask without changing artifacts.
export const protectedValue = value => value === '[MASKED]' ? '*****' : value;
