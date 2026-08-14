"use client";

import { ErrorState } from "../ui/StatePrimitives";

export default function CoursesError({ reset }) {
  return (
    <main><ErrorState title="Course information is temporarily unavailable." message="Your tournament and scoring screens are still available." onRetry={reset} returnHref="/home" /></main>
  );
}
