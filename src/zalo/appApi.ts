type GroupInfo = {
  currentMems?: Array<{ id: string; dName?: string; zaloName?: string }>;
  memVerList?: string[];
  totalMember?: number;
  hasMoreMember?: number;
};

export async function appGetGroupInfo(_groupId: string): Promise<GroupInfo | null> {
  return null;
}

export async function appGetGroupMembersInfo(_uids: string[]): Promise<Map<string, string>> {
  return new Map();
}
