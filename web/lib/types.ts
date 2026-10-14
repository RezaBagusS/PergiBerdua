export type AuthMode = 'login' | 'register';
export type Tab = 'wishlist' | 'plans' | 'memories' | 'account';
export const categories = ['Alam', 'Kuliner', 'Seni & budaya', 'Santai'] as const;
export type Category = typeof categories[number];
export type Filter = 'Semua' | Category;
export interface User {id: string; username: string; email: string; emailReminders: boolean}
export interface Room {
  id: string; title: string; status: 'active' | 'archived';
  anniversary: string | null; pair_key: string | null;
  state: 'active' | 'archived'; created_at: string; archived_at: string | null;
}
export interface Member {id: string; username: string; state: 'active' | 'archived'}
export interface Place {
  id: string; room_id: string; name: string; area: string; category: Category;
  budget: number; note: string; status: 'wish' | 'planned' | 'visited' | 'missed';
  scheduled_at: string | null; visited_at: string | null; created_at: string;
}
export interface PlaceDraft {
  name: string; area: string; category: Category; budget: number; note: string;
}
export interface MailJob {
  id: string; place_id: string | null; kind: 'reminder' | 'room_closed';
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduled_at: string; attempts: number;
}
export interface Notice {id: string; message: string; created_at: string}
export interface IncomingInvite {
  id: string;
  room_id: string;
  room_title: string;
  inviter_name: string;
  inviter_email: string;
  created_at: string;
}
export interface OutgoingInvite {
  id: string;
  invitee_email: string;
  invitee_name?: string;
  status: string;
  created_at: string;
}
export interface MeResponse {
  user: User;
  rooms: Room[];
  notices: Notice[];
  incomingInvite?: IncomingInvite | null;
}
export interface RoomResponse {
  room: Room;
  members: Member[];
  places: Place[];
  jobs: MailJob[];
  outgoingInvite?: OutgoingInvite | null;
}
export interface Config {mode: 'development' | 'production'; email: string; whatsapp: boolean}
export interface Invitation {
  url?: string;
  code?: string;
  expiresInHours?: number;
  inviteId?: string;
  email?: string;
  username?: string;
}
export type PlaceAction = 'schedule' | 'reschedule' | 'visited' | 'wish' | 'delete';
export type ModalState =
  | {kind: 'place'; place?: Place}
  | {kind: 'detail'; place: Place}
  | {kind: 'schedule'; place: Place}
  | {kind: 'delete'; place: Place}
  | {kind: 'room-profile'; room?: Room}
  | {kind: 'invite'; roomId: string; outgoingInvite?: OutgoingInvite | null}
  | {kind: 'join'}
  | {kind: 'leave'; room: Room; solo?: boolean};
