import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StatusPageContent, StatusSteps } from "./status-page";

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...rest} />
  ),
}));

describe("StatusPageContent", () => {
  it("renders the page landmark, meta row and copy", () => {
    const html = renderToStaticMarkup(
      <StatusPageContent
        code="404"
        brandLabel="临时笨迪"
        eyebrow="页面不存在"
        title="这里没有你要找的页面"
        description="链接可能已失效。"
      />,
    );

    expect(html).toContain('id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("status-page__code");
    expect(html).toContain("404");
    expect(html).toContain("页面不存在");
    expect(html).toContain("这里没有你要找的页面");
    expect(html).toContain("链接可能已失效。");
    expect(html).toContain('aria-labelledby="status-page-title"');
    expect(html).toContain('id="status-page-title"');
  });

  it("applies the tone and renders the decorative signal icon", () => {
    const html = renderToStaticMarkup(
      <StatusPageContent
        code="500"
        tone="danger"
        brandLabel="临时笨迪"
        eyebrow="页面异常"
        title="页面暂时无法加载"
        description="应用遇到了意外问题。"
        icon={<svg data-testid="signal-icon" />}
      />,
    );

    expect(html).toContain('data-tone="danger"');
    expect(html).toContain("status-page__signal");
    expect(html).toContain('data-testid="signal-icon"');
  });

  it("renders link and button actions with their variants", () => {
    const html = renderToStaticMarkup(
      <StatusPageContent
        code="404"
        brandLabel="临时笨迪"
        eyebrow="页面不存在"
        title="标题"
        description="描述"
        actions={[
          { key: "home", label: "返回首页", href: "/", variant: "primary" },
          {
            key: "retry",
            label: "重试",
            onClick: () => undefined,
            variant: "secondary",
            disabled: true,
          },
        ]}
      />,
    );

    expect(html).toContain('href="/"');
    expect(html).toContain("status-page__action--primary");
    expect(html).toContain("status-page__action--secondary");
    expect(html).toContain("返回首页");
    expect(html).toContain("重试");
    expect(html).toContain("disabled");
  });

  it("renders details and footnote when provided", () => {
    const html = renderToStaticMarkup(
      <StatusPageContent
        code="500"
        brandLabel="临时笨迪"
        eyebrow="页面异常"
        title="标题"
        description="描述"
        details={<p className="status-page__digest">错误编号 abc123</p>}
        footnote="如果问题持续出现，请稍后再试。"
      />,
    );

    expect(html).toContain("错误编号 abc123");
    expect(html).toContain("如果问题持续出现，请稍后再试。");
  });
});

describe("StatusSteps", () => {
  it("renders each step state and label", () => {
    const html = renderToStaticMarkup(
      <StatusSteps
        label="加入进度"
        steps={[
          { key: "submitted", label: "申请已提交", state: "done" },
          { key: "pending", label: "等待审批", state: "current" },
          { key: "enter", label: "自动进入", state: "upcoming" },
        ]}
      />,
    );

    expect(html).toContain('aria-label="加入进度"');
    expect(html).toContain('data-state="done"');
    expect(html).toContain('data-state="current"');
    expect(html).toContain('data-state="upcoming"');
    expect(html).toContain("申请已提交");
    expect(html).toContain("等待审批");
    expect(html).toContain("自动进入");
  });
});
