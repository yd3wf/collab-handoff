/**
 * Example only. A real project may generate this file from OpenAPI or protobuf.
 */
export interface OrderDto {
  id: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  totalAmount: number;
  currency: "CNY" | "USD";
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
