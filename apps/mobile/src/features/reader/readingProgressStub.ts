/**
 * Epic 131 will persist last-read page. Until then, call sites stay wired.
 * TODO(JTI-154): forward to AsyncStorage-backed module from library-epic-131.
 */
export function onReaderSettledPage(bookId: string, pageIndex: number): void {
  if (__DEV__) {
    console.log('[reader] onReaderSettledPage', { book_id: bookId, page_index: pageIndex });
  }
}

export function onReaderUnmount(bookId: string, lastSettledPageIndex: number): void {
  if (__DEV__) {
    console.log('[reader] onReaderUnmount', {
      book_id: bookId,
      last_settled_page_index: lastSettledPageIndex,
    });
  }
}
