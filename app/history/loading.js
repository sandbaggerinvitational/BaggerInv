import { Header, Footer } from "../components";

export default function HistoryLoading() {
  return <main><Header/><div className="appLoading" aria-live="polite" aria-busy="true"><div className="loadingBrand" role="status">Opening Tournament History…</div><div className="loadingShell" aria-hidden="true"><div className="skeleton skeletonTitle"/><div className="loadingGrid"><div className="skeleton loadingCard"/><div className="skeleton loadingCard"/><div className="skeleton loadingCard"/></div></div></div><Footer/></main>;
}
