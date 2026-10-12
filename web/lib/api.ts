import type {AuthMode, Config, Invitation, MeResponse, PlaceAction, PlaceDraft, RoomResponse, User} from './types';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
    })
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : 'Permintaan gagal. Coba lagi.';
    throw new ApiError(response.status, message);
  }
  return data as T;
}
// Typed client contracts; authoritative validation and authorization stay in API.
export const api = {
  config: () => request<Config>('/config'),
  me: () => request<MeResponse>('/me'),
  room: (id: string) => request<RoomResponse>(`/room?id=${encodeURIComponent(id)}`),
  requestOtp: (intent: AuthMode, email: string, username: string) =>
    request<{requestId: string; message: string}>('/auth/request', {intent, email, username}),
  verifyOtp: (requestId: string, code: string) => request<{user: User}>('/auth/verify', {requestId, code}),
  logout: () => request<{ok: true}>('/auth/logout', {}),
  preferences: (emailReminders: boolean) => request<{ok: true}>('/preferences', {emailReminders}),
  createRoom: (title: string, anniversary: string) => request<{id: string}>('/rooms/create', {title, anniversary}),
  roomProfile: (roomId: string, title: string, anniversary: string) =>
    request<{ok: true}>('/rooms/profile', {roomId, title, anniversary}),
  leave: (roomId: string) => request<{ok: true}>('/rooms/leave', {roomId, confirm: true}),
  invite: (roomId: string, email?: string) => request<Invitation>('/invites/create', {roomId, email}),
  accept: (param: {token?: string; inviteId?: string} | string) => {
    const body = typeof param === 'string' ? {token: param} : param;
    return request<{id: string}>('/invites/accept', body);
  },
  reject: (param: {inviteId?: string; token?: string}) => request<{ok: true}>('/invites/reject', param),
  cancelInvite: (roomId: string) => request<{ok: true}>('/invites/cancel', {roomId}),
  savePlace: (roomId: string, value: PlaceDraft, id?: string) =>
    request<{id: string}>('/places/save', {...value, roomId, id}),
  placeAction: (roomId: string, id: string, action: PlaceAction, at?: string) =>
    request<{ok: true}>('/places/action', {roomId, id, action, at})
};
