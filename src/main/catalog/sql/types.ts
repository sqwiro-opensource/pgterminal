/** A parameterised statement. Names are never interpolated; everything goes through `values`. */
export interface SqlStatement {
  text: string;
  values: unknown[];
}
