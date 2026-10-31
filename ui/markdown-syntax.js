// SPDX-License-Identifier: GPL-3.0-or-later
/* Markdown syntax hints — what a line of a note may be, in THIS app's own
   renderer. The guide exists so a person can write a knowledge base by hand:
   it names the forms Opensidian really draws, shows them in place and lets a
   tap land them in the model. It is not a copy of Obsidian's manual.

   GUIDE-BEGIN — data only. One row is one meaning:
     ins     what a chip inserts ("" = a passive example, not tappable)
     labels  what the chip shows (defaults to `ins`)
     ex      an example, printed beside the meaning
     hint    an i18n key (ui/i18n.js holds the sentence)
   Rows are the renderer's own subset, and tests/markdown_hints.rs pairs each
   documented form with the function that draws it (ui/editor.js for live
   preview, src-tauri/src/main.rs for the reading view), so a form the app does
   not render cannot appear here. Deliberately absent:
     - `> [!NOTE]` callouts, `$…$` math and `%%…%%` comments: parsed by the
       library (or inserted by the palette) but drawn as plain text or not at
       all, so teaching them would promise more than the app keeps;
     - frontmatter: parsed as metadata and hidden from the reading view, with
       no property editor to write it yet;
     - definition lists, `^sup^` / `~sub~`: pulldown-cmark's blanket
       Options::all() happens to parse them, but they have no styling and are
       not Obsidian syntax — a guide is a promise, not a parser dump. */
(function () {
  "use strict";

  /* A block-level line, one row per kind. */
  const BLOCKROWS = [
    { ins: ["# ", "## ", "### ", "#### ", "##### ", "###### "],
      labels: ["#", "##", "###", "####", "#####", "######"],
      ex: "## Title", hint: "heading level 1–6; one space after the #s" },
    { ins: ["- ", "1. "], labels: ["-", "1."],
      ex: "- item", hint: "bullet or numbered list; Enter continues it" },
    { ins: ["- [ ] ", "- [x] "], labels: ["- [ ]", "- [x]"],
      ex: "- [ ] todo",
      hint: "task; the reading view ticks it; a custom [!] [/] [-] [>] [?] counts as done there" },
    { ins: ["> "], labels: [">"],
      ex: "> quoted", hint: "quote; > > nests" },
    { ins: ["```", "~~~"], labels: ["```", "~~~"],
      ex: "```mermaid",
      hint: "code block; a language after the fence colours it and mermaid draws a diagram; close with the same fence on its own line" },
    { ins: ["| ", "| --- | "], labels: ["|", "| --- |"],
      ex: "| a | b |",
      hint: "a table's header row; the next row of | --- | sets the columns and their alignment" },
    { ins: ["---", "***", "___"], labels: ["---", "***", "___"],
      ex: "---", hint: "horizontal rule (three or more)" },
  ];

  /* What may sit inside a line. */
  const INLINEROWS = [
    { ins: ["**bold**"], ex: "**bold**", hint: "bold" },
    { ins: ["*italic*"], ex: "*italic*", hint: "italic" },
    { ins: ["***bold italic***"], ex: "***both***", hint: "bold and italic" },
    { ins: ["~~struck~~"], ex: "~~struck~~", hint: "strikethrough" },
    { ins: ["==marked=="], ex: "==marked==",
      hint: "highlight in live preview; the reading view keeps the == as text" },
    { ins: ["`code`"], ex: "`code`", hint: "inline code" },
  ];

  /* The forms only this app's renderer gives a target: links, embeds, tags,
     block ids. */
  const LINKROWS = [
    { ins: ["[[note]]"], ex: "[[Note]]",
      hint: "a link to another note; typing [[ is completed with the vault's note names" },
    { ins: ["[[note|alias]]"], ex: "[[Note|shown]]",
      hint: "a link whose label is different from the note name" },
    { ins: ["[[note#heading]]"], ex: "[[Note#Heading]]",
      hint: "a link to a heading in another note" },
    { ins: ["[[note#^id]]"], ex: "[[Note#^id]]", hint: "a link to a block id" },
    { ins: ["![[image.png]]"], ex: "![[pic.png]]",
      hint: "embed an image from the vault (png, jpg, jpeg, gif, webp)" },
    { ins: ["![[doc.pdf#page=3]]"], ex: "![[doc.pdf#page=3]]",
      hint: "embed a page of a PDF" },
    { ins: ["![alt](image.png)"], ex: "![alt](pic.png)",
      hint: "a Markdown image from the vault" },
    { ins: ["[text](Note.md)"], ex: "[text](Note.md)",
      hint: "a Markdown link to a note, the same link as [[ ]]" },
    { ins: ["[text](https://example.com)"], ex: "[text](https://example.com)",
      hint: "an external link; opens in the browser" },
    { ins: ["#tag"], ex: "#tag",
      hint: "a tag; letters, digits, _ and /; a number alone is not a tag" },
    // a block id belongs at the END of a block, so it is shown, not tapped:
    // a tap at a line start could only put the id before the text it labels
    { ins: [""], labels: ["^id"], ex: "text ^id",
      hint: "a block id at the end of a block; the reading view hides it, and [[Note#^id]] links to it" },
  ];

  /* Level 3 of the tree: the three places a line can take. */
  const SECTION = { block: "Line begins with", inline: "Inside a line", link: "Links & embeds" };

  /* A line that already carries a block marker is not offered a second one. */
  const MARKER = /^(?:[>#|]|```|~~~|-{3,}|\*{3,}|_{3,}|[-*+] |\d+\. )/;
  /* GUIDE-END */

  /* Rows -> items, the same shape every hint provider returns. `first` marks
     the row's first chip: the card prints the example and the sentence beside
     it, so the meaning is not hidden in a tooltip. */
  function rowItems(rows) {
    const out = [];
    for (const r of rows) {
      const ins = r.ins || [], lab = r.labels || ins;
      for (let i = 0; i < ins.length; i++) {
        out.push({ ins: ins[i], label: lab[i] || ins[i], hint: r.hint || "", ex: r.ex || "",
                   first: i === 0 ? 1 : 0 });
      }
    }
    return out;
  }
  function section(name, rows) { return { name, items: rowItems(rows) }; }

  /* What this place may be, as the tree ADR-8/9 paints. `prefix` is the text
     left of the caret on its line, `after` what is right of it, `fence` the
     code fence around the line (if any). The guide speaks only where a line
     may BEGIN — a blank line, or the start of a line that has no block marker
     yet. Everywhere else is prose and stays quiet, the same policy mermaid
     uses inside a fence: the place where the user writes words earns no token
     list. A blank line gets the whole cheat sheet; a line that already has
     text gets only what may BE the line, because an inline template tapped
     here would land in front of that text. `null` = nothing to say. */
  function helpOf(prefix, after, fence) {
    if (fence) return null;                                   // inside code: not Markdown
    const p = String(prefix == null ? "" : prefix);
    if (!/^[ \t]*$/.test(p)) return null;                     // the caret is mid-line: prose
    const a = String(after == null ? "" : after);
    if (MARKER.test(a)) return null;                          // this line is already a block
    const blank = !a.trim();
    const sections = blank
      ? [section(SECTION.block, BLOCKROWS), section(SECTION.inline, INLINEROWS), section(SECTION.link, LINKROWS)]
      : [section(SECTION.block, BLOCKROWS)];
    const items = [];
    for (const s of sections)
      for (const it of s.items) if (!items.some(x => x.ins === it.ins)) items.push(it);
    return { type: "Markdown", place: blank ? "Blank line" : "Line start", sections, items };
  }

  window.MdHints = { BLOCKROWS, INLINEROWS, LINKROWS, SECTION, helpOf };
})();
