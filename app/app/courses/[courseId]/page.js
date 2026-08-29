import CoursePage from "../../../courses/[courseId]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantCoursePage(props) {
  return CoursePage({ ...props, participantPresentation: true });
}
