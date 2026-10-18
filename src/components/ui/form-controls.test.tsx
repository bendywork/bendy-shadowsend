import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Field, SegmentedControl, TextInput } from "./form-controls";

describe("Field", () => {
  it("links hint and error copy to the control", () => {
    render(
      <Field
        id="room-code"
        label="房间号"
        hint="4–64 位房间码"
        error="请输入房间号"
        required
      >
        <TextInput />
      </Field>,
    );

    const input = screen.getByLabelText(/房间号/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "room-code-hint room-code-error");
    expect(screen.getByText("4–64 位房间码")).toHaveAttribute("id", "room-code-hint");
    expect(screen.getByRole("alert")).toHaveTextContent("请输入房间号");
  });

  it("omits aria-invalid when there is no error", () => {
    render(
      <Field id="room-name" label="房间名称">
        <TextInput />
      </Field>,
    );

    expect(screen.getByLabelText("房间名称")).not.toHaveAttribute("aria-invalid");
  });
});

describe("SegmentedControl", () => {
  it("exposes the active tab and reports changes", () => {
    const onChange = vi.fn();

    render(
      <SegmentedControl
        value="join"
        onChange={onChange}
        ariaLabel="房间入口方式"
        options={[
          { value: "join", label: "加入" },
          { value: "create", label: "创建" },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "加入" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "创建" }));
    expect(onChange).toHaveBeenCalledWith("create");
  });
});
