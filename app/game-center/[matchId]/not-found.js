import { ErrorState } from "../../ui/StatePrimitives";

export default function GameCenterNotFound() {
  return <main><ErrorState title="Match not found." message="This link does not match an active tournament match." returnHref="/live" returnLabel="Back to Tournament" /></main>;
}
