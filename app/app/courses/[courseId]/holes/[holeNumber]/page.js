import CourseHolePage from "../../../../../courses/[courseId]/holes/[holeNumber]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantCourseHolePage(props) {
  return CourseHolePage({ ...props, participantPresentation: true });
}
