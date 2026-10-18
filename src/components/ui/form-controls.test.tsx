import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, SegmentedControl, TextInput } from "./form-controls";

describe("Field", () => {
  it("links hint and error text to the control", () => {
    render(
      <Field
        id="room-code"
        label="房间号"
        hint="10 位字母数字"
        error="房间号格式不正确"
        required
      >
        <TextInput />
      </Field>,
    );

    const input = screen.getByLabelText(/房间号/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-describedby", "room-code-hint room-code-error");
    expect(screen.getByRole("alert")).toHaveTextContent("房间号格式不正确");
  });

  it("omits invalid state and descriptions when the field is valid", () => {
    render(
      <Field id="room-name" label="房间名称">
        <TextInput />
      </Field>,
    );

    const input = screen.getByLabelText("房间名称");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("SegmentedControl", () => {
  it("exposes tab semantics and panel wiring", () => {
    render(
      <SegmentedControl
        id="home-tabs"
        panelId="home-form-panel"
        value="join"
        onChange={() => {}}
        ariaLabel="加入或创建房间"
        options={[
          { value: "join", label: "加入" },
          { value: "create", label: "创建" },
        ]}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("id", "home-tabs-join");
    expect(tabs[0]).toHaveAttribute("aria-controls", "home-form-panel");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });
});
