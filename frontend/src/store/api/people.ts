import { mapClient, mapDirectoryPerson, mapUser, type ApiClient, type ApiUser, type DirectoryPerson } from "@/lib/api-mappers";
import type { PageMeta, Paged } from "@/types/api";
import type { User } from "@/types/domain";
import { baseApi } from "./base";
import { params, toPage, unwrap, type Env } from "./envelope";

export interface ListUsersParams {
  search?: string;
  role?: string;
  /** Everyone who is not a client. */
  staff?: boolean;
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ListClientsParams {
  search?: string;
  status?: string;
  /** A CSR id, or "none" for clients without one. */
  csrId?: string;
  state?: string;
  filter?: "due" | "invited" | "waiting";
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface InviteClientInput {
  email: string;
  name?: string;
  csrId?: string;
  serviceId?: string;
  businessName?: string;
  formationState?: string;
  priority?: string;
  deadline?: string;
  note?: string;
}

export interface ClientProfileChanges {
  businessName?: string;
  formationState?: string;
  phone?: string;
  address?: string;
  contactPreference?: string;
  preferredName?: string;
}

export type CreatedClient = User & { invitationEmail: "sent" | "failed" | "switched-off" };

export const peopleApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- staff and accounts (Admin, Manager) ------------------------------------------------------------------
    users: build.query<Paged<User>, ListUsersParams | void>({
      query: (p) => ({ url: "/users", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiUser[], PageMeta>) => toPage(env, mapUser),
      providesTags: (r) => [{ type: "User", id: "LIST" }, ...(r?.items ?? []).map((u) => ({ type: "User" as const, id: u.id }))],
    }),
    user: build.query<User, string>({
      query: (id) => `/users/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "User", id }],
    }),
    /** Active staff for pickers (any staff member may call it). */
    directory: build.query<DirectoryPerson[], { role?: string } | void>({
      query: (p) => ({ url: "/users/directory", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<Array<{ id: string; name: string; role: string }>>) => unwrap(env).map(mapDirectoryPerson),
      providesTags: [{ type: "User", id: "DIRECTORY" }],
    }),
    inviteUser: build.mutation<User, { email: string; role: string; name?: string; note?: string }>({
      query: (body) => ({ url: "/users", method: "POST", body }),
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
      invalidatesTags: [{ type: "User", id: "LIST" }, { type: "User", id: "DIRECTORY" }, "Dashboard"],
    }),
    resendInvitation: build.mutation<User, string>({
      query: (id) => ({ url: `/users/${encodeURIComponent(id)}/resend-invitation`, method: "POST" }),
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
    }),
    changeEmail: build.mutation<User, { id: string; email: string }>({
      query: ({ id, email }) => ({ url: `/users/${encodeURIComponent(id)}/email`, method: "PATCH", body: { email } }),
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "User", id }, { type: "User", id: "LIST" }, { type: "Client", id }, { type: "Client", id: "LIST" }],
    }),
    setUserStatus: build.mutation<User, { id: string; status: "ACTIVE" | "SUSPENDED"; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/users/${encodeURIComponent(id)}/status`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "User", id }, { type: "User", id: "LIST" }, { type: "Client", id }, { type: "Client", id: "LIST" }, "Dashboard"],
    }),
    removeUser: build.mutation<User, string>({
      query: (id) => ({ url: `/users/${encodeURIComponent(id)}`, method: "DELETE" }),
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
      invalidatesTags: (_r, _e, id) => [{ type: "User", id }, { type: "User", id: "LIST" }, { type: "User", id: "DIRECTORY" }, { type: "Client", id: "LIST" }, "Case", "Dashboard"],
    }),
    renameUser: build.mutation<User, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/users/${encodeURIComponent(id)}`, method: "PATCH", body: { name } }),
      transformResponse: (env: Env<ApiUser>) => mapUser(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "User", id }, { type: "User", id: "LIST" }, { type: "Client", id }, "Me"],
    }),

    // ---- clients ----------------------------------------------------------------------------------------------
    clients: build.query<Paged<User>, ListClientsParams | void>({
      query: (p) => ({ url: "/clients", params: params({ ...(p ?? {}) }) }),
      transformResponse: (env: Env<ApiClient[], PageMeta>) => toPage(env, mapClient),
      providesTags: (r) => [{ type: "Client", id: "LIST" }, ...(r?.items ?? []).map((c) => ({ type: "Client" as const, id: c.id }))],
    }),
    client: build.query<User, string>({
      query: (id) => `/clients/${encodeURIComponent(id)}`,
      transformResponse: (env: Env<ApiClient>) => mapClient(unwrap(env)),
      providesTags: (_r, _e, id) => [{ type: "Client", id }],
    }),
    inviteClient: build.mutation<CreatedClient, InviteClientInput>({
      query: (body) => ({ url: "/clients", method: "POST", body }),
      transformResponse: (env: Env<ApiClient & { invitationEmail: CreatedClient["invitationEmail"] }>) => ({
        ...mapClient(unwrap(env)),
        invitationEmail: unwrap(env).invitationEmail,
      }),
      invalidatesTags: [{ type: "Client", id: "LIST" }, { type: "User", id: "LIST" }, "Case", "Dashboard"],
    }),
    updateClientProfile: build.mutation<User, { id: string } & ClientProfileChanges>({
      query: ({ id, ...body }) => ({ url: `/clients/${encodeURIComponent(id)}/profile`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiClient>) => mapClient(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Client", id }, { type: "Client", id: "LIST" }, { type: "User", id }, "Me"],
    }),
    changeCsr: build.mutation<User, { id: string; csrId: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/clients/${encodeURIComponent(id)}/csr`, method: "PATCH", body }),
      transformResponse: (env: Env<ApiClient>) => mapClient(unwrap(env)),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Client", id }, { type: "Client", id: "LIST" }, { type: "User", id: "LIST" }, "Case", "Dashboard"],
    }),
  }),
});

export const {
  useUsersQuery,
  useUserQuery,
  useDirectoryQuery,
  useInviteUserMutation,
  useResendInvitationMutation,
  useChangeEmailMutation,
  useSetUserStatusMutation,
  useRemoveUserMutation,
  useRenameUserMutation,
  useClientsQuery,
  useClientQuery,
  useInviteClientMutation,
  useUpdateClientProfileMutation,
  useChangeCsrMutation,
} = peopleApi;
