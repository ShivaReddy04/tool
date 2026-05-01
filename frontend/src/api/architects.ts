import api from "./client";

export interface Architect {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface RawArchitect {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
}

/**
 * Fetch active architects, optionally filtered by `search` (server-side
 * substring match on first/last name and email). Pass an AbortSignal so
 * the autocomplete can cancel stale in-flight requests as the user types.
 */
export const fetchArchitects = async (
  search: string = "",
  signal?: AbortSignal
): Promise<Architect[]> => {
  const { data } = await api.get<RawArchitect[]>("/users/architects", {
    params: search ? { search } : undefined,
    signal,
  });
  return data.map((a) => ({
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
  }));
};

export const formatArchitectName = (a: Pick<Architect, "firstName" | "lastName" | "email">) => {
  const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  return name || a.email;
};
