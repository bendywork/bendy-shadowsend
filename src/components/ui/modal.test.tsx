import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalContent } from "@/components/ui/modal";

const baseProps = {
  title: "Room settings",
  description: "Manage the room",
  titleId: "modal-title",
  descriptionId: "modal-description",
  closeLabel: "Close",
  onClose: () => undefined,
};

describe("ModalContent", () => {
  it("renders dialog semantics and wires title/description ids", () => {
    const html = renderToStaticMarkup(
      <ModalContent {...baseProps}>
        <input aria-label="Room name" />
      </ModalContent>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="modal-title"');
    expect(html).toContain('aria-describedby="modal-description"');
    expect(html).toContain('id="modal-title"');
    expect(html).toContain('id="modal-description"');
    expect(html).toContain("Room settings");
    expect(html).toContain("Manage the room");
  });

  it("renders an accessible close button and supports disabling it", () => {
    const html = renderToStaticMarkup(
      <ModalContent {...baseProps} closeDisabled>
        body
      </ModalContent>,
    );

    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("disabled");
  });

  it("keeps the dialog body content in the DOM", () => {
    const html = renderToStaticMarkup(
      <ModalContent {...baseProps}>
        <p>Body copy</p>
      </ModalContent>,
    );

    expect(html).toContain("Body copy");
  });
});
