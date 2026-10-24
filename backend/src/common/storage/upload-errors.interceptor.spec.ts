import { BadRequestException, PayloadTooLargeException, type CallHandler, type ExecutionContext } from "@nestjs/common";
import { MulterError } from "multer";
import { firstValueFrom, throwError } from "rxjs";

import type { AppConfig } from "../../config/app-config";
import { FileRequiredException, FileTooLargeException } from "../exceptions";
import { UploadErrorsInterceptor } from "./upload-errors.interceptor";

const interceptor = new UploadErrorsInterceptor({ env: { MAX_UPLOAD_MB: 25 } } as AppConfig);
const failWith = (error: unknown): Promise<unknown> =>
  firstValueFrom(interceptor.intercept({} as ExecutionContext, { handle: () => throwError(() => error) } as CallHandler)).then(
    () => {
      throw new Error("expected a failure");
    },
    (e: unknown) => e,
  );

describe("UploadErrorsInterceptor", () => {
  it("turns what Nest already translated into the API's own errors", async () => {
    expect(await failWith(new PayloadTooLargeException("File too large"))).toBeInstanceOf(FileTooLargeException);
    expect(await failWith(new BadRequestException("Unexpected field"))).toBeInstanceOf(FileRequiredException);
    expect(await failWith(new BadRequestException("Unexpected file field"))).toBeInstanceOf(FileRequiredException);
    expect(await failWith(new BadRequestException("Multipart: Boundary not found"))).toBeInstanceOf(FileRequiredException);
  });

  it("recognises multer's own errors by their code, whatever the message says", async () => {
    // These reach the interceptor as MulterError when Nest does not recognise multer's message text (a newer multer reworded them).
    expect(await failWith(new MulterError("LIMIT_UNEXPECTED_FILE", "attachment"))).toBeInstanceOf(FileRequiredException);
    expect(await failWith(new MulterError("LIMIT_FILE_SIZE", "file"))).toBeInstanceOf(FileTooLargeException);
    const other = await failWith(new MulterError("LIMIT_PART_COUNT"));
    expect(other).toBeInstanceOf(BadRequestException); // a 400, never a 500
  });

  it("leaves every other failure alone", async () => {
    const mine = new Error("something else");
    expect(await failWith(mine)).toBe(mine);
  });
});
