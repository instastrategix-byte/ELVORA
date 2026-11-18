import { describe, expect, it } from "vitest";
import { linkDisplay, linkUrlError } from "@backend/modules/profiles/links";

describe("linkUrlError", () => {
  it("accepts valid links for each platform", () => {
    expect(linkUrlError("linkedin", "https://www.linkedin.com/in/ana")).toBeNull();
    expect(linkUrlError("x", "https://twitter.com/ana")).toBeNull();
    expect(linkUrlError("youtube", "https://youtu.be/abc")).toBeNull();
    expect(linkUrlError("pinterest", "https://pinterest.co.uk/ana")).toBeNull();
    expect(linkUrlError("website", "https://ana.studio")).toBeNull();
  });

  it("explains what's wrong", () => {
    expect(linkUrlError("instagram", "http://instagram.com/ana")).toMatch(/https/);
    expect(linkUrlError("instagram", "https://evil.example/ana")).toMatch(/Instagram link/);
    expect(linkUrlError("github", "https://github.com.evil.example/ana")).toMatch(/GitHub link/);
    expect(linkUrlError("website", "instagram.com/ana")).toMatch(/https:\/\//);
    expect(linkUrlError("website", "https://localhost")).toMatch(/valid web address/);
    expect(linkUrlError("website", "")).toMatch(/Enter a link/);
  });
});

describe("linkDisplay", () => {
  it("shows handles and short paths, otherwise the host", () => {
    expect(linkDisplay("https://youtube.com/@ana")).toBe("@ana");
    expect(linkDisplay("https://www.ana.studio/")).toBe("ana.studio");
    expect(linkDisplay("https://github.com/ana")).toBe("github.com/ana");
  });
});
