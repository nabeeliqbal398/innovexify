"use client";

import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { useAppDispatch, useAppSelector } from "@/hooks/useStore";
import { workspaceActions } from "@/store/workspaceSlice";

/** Explains why an action was refused. Every refusal is also written to the audit log. */
export function DeniedDialog() {
  const denied = useAppSelector((s) => s.workspace.denied);
  const dispatch = useAppDispatch();
  const close = (): void => {
    dispatch(workspaceActions.deniedSet(null));
  };
  return (
    <Modal
      alert
      open={Boolean(denied)}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={denied?.title ?? ""}
      icon={
        <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-danger-soft text-danger-hover">
          <Icon name="lock" />
        </span>
      }
    >
      <p className="text-neutral">{denied?.body}</p>
      <span className="help">The attempt was recorded in the audit log.</span>
      <ModalFooter>
        <Button variant="primary" onClick={close}>
          Understood
        </Button>
      </ModalFooter>
    </Modal>
  );
}
