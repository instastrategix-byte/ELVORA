// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText, tokenize } from "./rich-text";

describe("tokenize", () => {
  it("finds links, hashtags and mentions and keeps the rest as text", () => {
    expect(tokenize("Hello @isabella, see https://elvora.app/x. #Yachting!")).toEqual([
      { t: "text", v: "Hello " },
      { t: "mention", v: "isabella" },
      { t: "text", v: ", see " },
      { t: "url", v: "https://elvora.app/x" },
      { t: "text", v: ". " },
      { t: "tag", v: "Yachting" },
      { t: "text", v: "!" },
    ]);
  });

  it("ignores emails and in-word hashes", () => {
    expect(tokenize("mail me@example.com or a#b")).toEqual([{ t: "text", v: "mail me@example.com or a#b" }]);
  });
});

describe("RichText", () => {
  it("links mentions to profiles and hashtags to search; external links are nofollow", () => {
    render(<RichText text="Congrats @marco on #Monaco https://example.com" />);
    expect(screen.getByRole("link", { name: "@marco" })).toHaveAttribute("href", "/members/marco");
    expect(screen.getByRole("link", { name: "#Monaco" })).toHaveAttribute("href", "/search?type=posts&q=%23Monaco");
    expect(screen.getByRole("link", { name: "example.com" })).toHaveAttribute("rel", expect.stringContaining("nofollow"));
  });

  it("collapses long posts behind Show more", () => {
    render(<RichText text={"word ".repeat(200)} />);
    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
  });
});
