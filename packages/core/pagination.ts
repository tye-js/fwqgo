export type OffsetPagination = {
  pageNo: number;
  pageSize: number;
  offset: number;
};

type OffsetPaginationInput = {
  pageNo?: number;
  pageSize?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
};

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGE_SIZE = 100;

function positiveSafeInteger(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : null;
}

export function normalizeOffsetPagination(
  input: OffsetPaginationInput = {},
): OffsetPagination {
  const maxPageSize =
    positiveSafeInteger(input.maxPageSize) ?? DEFAULT_MAX_PAGE_SIZE;
  const defaultPageSize = Math.min(
    positiveSafeInteger(input.defaultPageSize) ?? DEFAULT_PAGE_SIZE,
    maxPageSize,
  );
  const pageSize = Math.min(
    positiveSafeInteger(input.pageSize) ?? defaultPageSize,
    maxPageSize,
  );
  const pageNo = positiveSafeInteger(input.pageNo) ?? 1;
  const offset = (pageNo - 1) * pageSize;

  if (!Number.isSafeInteger(offset) || offset < 0) {
    return { pageNo: 1, pageSize, offset: 0 };
  }

  return { pageNo, pageSize, offset };
}

export function boundOffsetPaginationByTotal(
  pagination: OffsetPagination,
  totalCount: number,
) {
  const normalizedTotalCount =
    Number.isSafeInteger(totalCount) && totalCount > 0 ? totalCount : 0;
  const totalPage =
    normalizedTotalCount === 0
      ? 0
      : Math.ceil(normalizedTotalCount / pagination.pageSize);
  const pageNo = Math.min(pagination.pageNo, Math.max(totalPage, 1));

  return {
    ...pagination,
    pageNo,
    offset: (pageNo - 1) * pagination.pageSize,
    totalCount: normalizedTotalCount,
    totalPage,
  };
}
