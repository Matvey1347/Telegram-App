import {
  Fragment,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";

function actionText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(actionText).join(" ");
  if (!isValidElement(node)) return "";
  return actionText((node.props as { children?: ReactNode }).children);
}

function hasGraphic(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasGraphic);
  if (!isValidElement(node)) return false;
  const props = node.props as { children?: ReactNode };
  if (node.type === Fragment || node.type === "span") {
    return hasGraphic(props.children);
  }
  return node.type !== "strong" && node.type !== "em";
}

export function CreateActionIcon({ children }: PropsWithChildren) {
  const createAction =
    !hasGraphic(children) &&
    /^(create|add|new|sell|invite|створ|додат|нов|созд|добав)/i.test(
      actionText(children).trim(),
    );
  return createAction ? (
    <Plus size={16} aria-hidden="true" data-create-action-icon="true" />
  ) : null;
}
