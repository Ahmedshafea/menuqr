import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordResetForm } from "./password-reset-form";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

function response(code: string) {
  return Promise.resolve({ ok: false, json: async () => ({ error: { code } }) } as Response);
}

describe("PasswordResetForm error mapping", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => cleanup());

  async function submitReset(errorCode: string) {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockImplementationOnce(() => response(errorCode));
    const { container } = render(<PasswordResetForm audience="customer" />);
    fireEvent.change(screen.getByLabelText("phone"), { target: { value: "01001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "sendCode" }));
    await screen.findByLabelText("code");
    fireEvent.change(screen.getByLabelText("code"), { target: { value: "123456" } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: "StrongPass1" } });
    fireEvent.change(screen.getByLabelText("confirmPassword"), { target: { value: "StrongPass1" } });
    fireEvent.click(screen.getByRole("button", { name: "resetPassword" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  }

  it.each([
    ["INVALID_OTP", "invalidCode"],
    ["OTP_EXPIRED", "invalidCode"],
    ["INVALID_PASSWORD_RESET", "invalidPassword"],
  ])("maps %s to %s", async (code, message) => {
    await submitReset(code);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
