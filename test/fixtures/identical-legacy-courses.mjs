// Read-only Production evidence verified on 2026-09-04. Test fixtures only;
// the installed exception derives identity/holes from database facts, not here.
function holes(pars, indexes, yards) {
  return pars.map((par, index) => ({
    hole_number: index + 1, par, stroke_index: indexes[index], yardage: yards[index],
  }));
}

export const identicalLegacyCourses = [
  {
    course_id: "CPGC01", tee: "Black", rating: 72.7, slope: 138, par: 72,
    course_name: "Cougar Point Golf Course", round_numbers: [2], matchCount: 6,
    fingerprint: "f7aa69136b946abaa9f028709704426b1f458e0e19f39baad423daa3b0d53948",
    holes: holes(
      [4,3,5,4,4,3,4,4,5,4,5,3,4,3,5,4,4,4],
      [13,11,17,1,5,9,7,15,3,4,18,8,10,16,14,6,12,2],
      [345,162,521,446,385,176,343,348,548,423,481,215,400,163,525,390,356,393],
    ),
  },
  {
    course_id: "OCGC01", tee: "Gold", rating: 74.7, slope: 150, par: 72,
    course_name: "The Ocean Course", round_numbers: [3], matchCount: 12,
    fingerprint: "033c650f6e06e519c584f9ed87ecfb5291fcc12bde91cdc6c909dcd25baeef79",
    holes: holes(
      [4,5,4,4,3,4,5,3,4,4,5,4,4,3,4,5,3,4],
      [15,3,9,1,11,13,7,17,5,16,8,10,2,14,18,4,12,6],
      [371,520,363,430,185,382,505,180,415,388,521,420,371,171,387,548,197,439],
    ),
  },
];
