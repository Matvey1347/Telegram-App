"use client";

import dynamic from "next/dynamic";
import type {
  Account,
  Transaction,
  TransactionCategory,
  TransactionType,
  Transfer,
  WorkspaceMemberSelectOption,
} from "@/lib/api";

const AccountModal = dynamic(
  () => import("./finance-overview-modals").then((module) => module.AccountModal),
  { loading: () => null },
);
const CategoryModal = dynamic(
  () =>
    import("./finance-overview-modals").then((module) => module.CategoryModal),
  { loading: () => null },
);
const TransferModal = dynamic(
  () =>
    import("./finance-overview-modals").then((module) => module.TransferModal),
  { loading: () => null },
);
const InternalTransactionModal = dynamic(
  () =>
    import("./transaction-modal").then(
      (module) => module.InternalTransactionModal,
    ),
  { loading: () => null },
);

export type FinanceEditor =
  | { kind: "account"; item?: Account }
  | { kind: "transaction"; item?: Transaction }
  | { kind: "category"; item?: TransactionCategory }
  | { kind: "transfer"; item?: Transfer }
  | null;

type FinanceEditorTarget = Exclude<FinanceEditor, null>;

export function FinanceOverviewEditors({
  editor,
  categoryType,
  currencies,
  accounts,
  categories,
  members,
  onClose,
  onSubmit,
}: {
  editor: FinanceEditor;
  categoryType: TransactionType;
  currencies: string[];
  accounts: Account[];
  categories?: TransactionCategory[];
  members: WorkspaceMemberSelectOption[];
  onClose: () => void;
  onSubmit: (target: FinanceEditorTarget, value: unknown) => void;
}) {
  if (!editor) return null;

  return (
    <>
      {editor.kind === "account" ? (
        <AccountModal
          open
          initial={editor.item}
          currencies={currencies}
          onClose={onClose}
          onSubmit={(value) =>
            onSubmit(editor, {
              ...value,
              currency: value.currency.toUpperCase(),
              initialBalance: Number(value.initialBalance),
            })
          }
        />
      ) : null}
      {editor.kind === "transaction" ? (
        <InternalTransactionModal
          open
          title={editor.item ? "Edit transaction" : "Create transaction"}
          initial={editor.item}
          accounts={accounts}
          categories={categories}
          members={members}
          onClose={onClose}
          onSubmit={(value) =>
            onSubmit(editor, { ...value, amount: Number(value.amount) })
          }
        />
      ) : null}
      {editor.kind === "category" ? (
        <CategoryModal
          open
          initial={editor.item}
          initialType={categoryType}
          onClose={onClose}
          onSubmit={(value) => onSubmit(editor, value)}
        />
      ) : null}
      {editor.kind === "transfer" ? (
        <TransferModal
          open
          initial={editor.item}
          accounts={accounts}
          onClose={onClose}
          onSubmit={(value) => onSubmit(editor, value)}
        />
      ) : null}
    </>
  );
}
