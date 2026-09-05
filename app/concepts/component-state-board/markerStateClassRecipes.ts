// Prototype-only marker recipes (the component-state board's warm palette).
// Moved out of components/ui/design-system.tsx in Phase 4 PR 3b: nothing in
// the shipped app consumed the table, and app/concepts is outside the token
// layer's hex scan. The production marker is components/seat-map/SeatMarker.tsx
// on the Phase 3 `.sp-pill` vocabulary.
export const markerStateClassRecipes = {
  available: "border-[#BEB4A8] bg-white text-[#070A0D]",
  assigned: "border-[#8E8276] bg-white text-[#070A0D]",
  selected: "border-[#D46A24] bg-[#171A1D] text-white ring-4 ring-[#D46A24]/35",
  searchResult: "border-[#D23F0A] bg-[#FBEAE1] text-[#9E2F06] ring-4 ring-[#F0B49A]",
  keyboardFocus: "border-[#070A0D] bg-white text-[#070A0D] ring-4 ring-[#D46A24]/45",
  draftModified: "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50]",
  moveOrigin: "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]",
  validDestination: "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B] ring-4 ring-[#A9D7B8]",
  invalidDestination: "border-[#B3232C] bg-[#FBE9EA] text-[#7E2F24] ring-4 ring-[#E8A5A9]",
  swapSource: "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B] ring-4 ring-[#A9D7B8]",
  swapTarget: "border-[#6E655A] bg-[#F1ECE4] text-[#353532] ring-4 ring-[#D8D0C5]",
  protectedOriginal: "border-[#696159] bg-[#E7E1D8] text-[#353532]",
  customSeat: "border-[#D46A24] bg-[#F6E7D8] text-[#6F2C13]",
  reserved: "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50]",
  unavailable: "border-[#BEB4A8] bg-[#E7E1D8] text-[#696159]",
  plannerHighlight: "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]"
} as const;

export type MarkerStateRecipe = keyof typeof markerStateClassRecipes;
