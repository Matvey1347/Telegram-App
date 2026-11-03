import { describe, expect, it } from "vitest";
import { candidateFixture } from "./lead-fixtures.test-support";
import { candidateContactCategory, contactDescription, publicLeadUrl } from "./lead-candidate-presentation";

describe("candidate contact presentation", () => {
  it("distinguishes an evidenced advertising contact from the project link", () => {
    const candidate = candidateFixture();
    candidate.contacts = [
      { type: "TELEGRAM", value: "@public_channel", role: "ADVERTISED_DESTINATION", evidence: "button", confirmed: false },
      { type: "TELEGRAM", value: "@ads_contact", role: "SALES_CONTACT", purpose: "CONTACT_FOR_ADS", evidence: "profile", confirmed: false },
    ];
    expect(candidateContactCategory(candidate)).toBe("BUSINESS_CONTACT_FOUND");
    expect(contactDescription(candidate.contacts[1])).toBe("Контакт для рекламы");
    expect(publicLeadUrl(candidate.contacts[1])).toBe("https://t.me/ads_contact");
  });
  it("does not treat a website or bot as a verified business contact", () => {
    const candidate = candidateFixture();
    candidate.contacts = [{ type: "WEBSITE", value: "https://example.org", role: "ADVERTISED_DESTINATION", evidence: "button" }];
    expect(candidateContactCategory(candidate)).toBe("CONTACT_POINT_ONLY");
    candidate.contacts = [{ type: "TELEGRAM", value: "@sample_bot", role: "ADVERTISED_DESTINATION", evidence: "button" }];
    expect(candidateContactCategory(candidate)).toBe("CONTACT_POINT_ONLY");
    expect(contactDescription(candidate.contacts[0])).toContain("не бизнес-контакт");
    candidate.contacts[0] = { ...candidate.contacts[0], role: "SALES_CONTACT", purpose: "CONTACT_FOR_ADS" };
    expect(candidateContactCategory(candidate)).toBe("CONTACT_NOT_FOUND");
  });
  it("keeps an unresolved project unresolved even with an order contact", () => {
    const candidate = candidateFixture();
    candidate.risks = ["UNRESOLVED_PROJECT"];
    candidate.contacts[0].purpose = "PROJECT_CONTACT";
    expect(candidateContactCategory(candidate)).toBe("TARGET_UNRESOLVED");
    expect(contactDescription(candidate.contacts[0])).toContain("заказа");
  });
  it("does not trust image-only identity, unknown purpose, or unsafe links", () => {
    const candidate = candidateFixture();
    candidate.risks = ["IMAGE_EVIDENCE_UNVERIFIED"];
    expect(candidateContactCategory(candidate)).toBe("TARGET_UNRESOLVED");
    candidate.risks = [];
    expect(candidateContactCategory(candidate)).toBe("CONTACT_NOT_FOUND");
    expect(publicLeadUrl({ type: "WEBSITE", value: "javascript:alert(1)", role: "ADVERTISED_DESTINATION", evidence: "" })).toBeUndefined();
  });
});
