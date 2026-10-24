const sendMail = jest.fn();
const createTransport = jest.fn((_options: unknown) => ({ sendMail }));
jest.mock("nodemailer", () => ({ createTransport: (options: unknown) => createTransport(options) }));

import { SmtpMailService, type SmtpSettings } from "./smtp-mail.service";

const settings: SmtpSettings = { host: "smtp.example.com", port: 587, user: "user", password: "secret", from: "Innovexify <no-reply@example.com>", requireTls: true };
const message = { to: "a@b.co", subject: "Hi", text: "Open /reset-password/abc", kind: "password-reset" as const };

describe("SmtpMailService", () => {
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
  });

  it("sends from the configured address with the message recipient, subject and text", async () => {
    sendMail.mockResolvedValue({});
    await new SmtpMailService(settings).send(message);
    expect(sendMail).toHaveBeenCalledWith({ from: settings.from, to: "a@b.co", subject: "Hi", text: "Open /reset-password/abc" });
  });

  it("requires STARTTLS on port 587 and uses implicit TLS on 465", () => {
    new SmtpMailService(settings);
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true, auth: { user: "user", pass: "secret" } }));
    new SmtpMailService({ ...settings, port: 465 });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }));
  });

  it("allows plain SMTP only when the settings say so", () => {
    new SmtpMailService({ ...settings, requireTls: false });
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ requireTLS: false }));
  });

  it("rejects when the server refuses the message, without echoing the server text or the body", async () => {
    sendMail.mockRejectedValue(new Error("550 mailbox unavailable at secret-host"));
    await expect(new SmtpMailService(settings).send(message)).rejects.toThrow("The email could not be sent (password-reset).");
  });
});
