import CoursesPage from "../../courses/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantCoursesPage(props) {
  return CoursesPage({ ...props, participantPresentation: true });
}
