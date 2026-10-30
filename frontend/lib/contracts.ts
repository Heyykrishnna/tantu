export interface Document {
    type: "doc";
    content: {
        type: "paragraph" | "heading";
        content: {
            type: "text";
            text: string;
        }[];
    }[];
}

export interface RecordInput {
    title: string;
    visibility?: "private" | "workspace";
    parentId?: string | null;
    body?: Document;
    status?: "open" | "done";
    priority?: "low" | "normal" | "high" | "urgent";
    deadline?: string | null;
    estimateMinutes?: number | null;
}

export interface CanonicalRecord {
    id: string;
    workspaceId: string;
    ownerId: string;
    kind: "task" | "page";
    title: string;
    visibility: "private" | "workspace";
    parentId: string | null;
    body: Document;
    status: "open" | "done";
    priority: "low" | "normal" | "high" | "urgent";
    deadline: string | null;
    estimateMinutes: number | null;
    version: number;
    canEdit: boolean;
    createdAt: string;
    updatedAt: string;
}
