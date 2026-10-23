"use client";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { baseApi, TAGS } from "@/store/api/base";
import { uiActions } from "@/store/uiSlice";

/**
 * Shown when the server says the record changed while the person was editing (409 CONCURRENT_MODIFICATION).
 * "Reload" refetches everything on screen; forms keep what the person typed, and the next save uses the newer version.
 */
export function ConflictDialog() {
  const conflict = useAppSelector((s) => s.ui.conflict);
  const dispatch = useAppDispatch();
  const close = (): void => {
    dispatch(uiActions.conflictSet(null));
  };
  const reload = (): void => {
    dispatch(baseApi.util.invalidateTags([...TAGS]));
    close();
  };
  return (
    <Modal
      alert
      open={Boolean(conflict)}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="This changed while you were editing"
      icon={
        <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-warning-soft text-warning">
          <Icon name="alert" />
        </span>
      }
    >
      <p className="text-neutral">{conflict?.message}</p>
      <span className="help">Reload to see the latest version. What you typed stays in the form so you can save it again.</span>
      <ModalFooter>
        <Button onClick={close}>Keep editing</Button>
        <Button variant="primary" onClick={reload}>
          Reload
        </Button>
      </ModalFooter>
    </Modal>
  );
}
