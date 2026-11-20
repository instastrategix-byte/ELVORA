import { describe, expect, it } from "vitest";
import { businessReadiness, MIN_DESCRIPTION_CHARS, missingRequired } from "@backend/modules/listings/readiness";

const complete = {
  name: "Atelier Marchetti",
  category: "hospitality",
  description: "x".repeat(MIN_DESCRIPTION_CHARS),
  location: "Milan, Italy",
  website: null,
  contactEmail: "hello@atelier.example",
  registrationNumber: "IT-123",
  logoPath: null,
  evidencePaths: ["u/doc.pdf"],
};

describe("business readiness", () => {
  it("is ready when every required item is present; website and logo are only recommended", () => {
    expect(missingRequired(complete)).toEqual([]);
    const recommended = businessReadiness(complete).filter((i) => !i.required && !i.done).map((i) => i.key);
    expect(recommended).toEqual(["website", "logoPath"]);
  });

  it("names each missing required item", () => {
    expect(
      missingRequired({ ...complete, description: "short", location: " ", registrationNumber: null, evidencePaths: [] }),
    ).toEqual(["Description", "Location", "Company registration number", "Verification documents"]);
  });
});
