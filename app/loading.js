export default function Loading() {
  return (
    <main className="appLoading" aria-live="polite" aria-busy="true">
      <div className="loadingBrand">Sandbagger Invitational</div>
      <div className="loadingShell">
        <div className="skeleton skeletonTitle" />
        <div className="skeleton skeletonLine" />
        <div className="skeleton skeletonLine short" />
        <div className="loadingGrid">
          <div className="skeleton loadingCard" />
          <div className="skeleton loadingCard" />
          <div className="skeleton loadingCard" />
        </div>
      </div>
    </main>
  );
}
