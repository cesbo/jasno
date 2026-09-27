import { component, h } from 'jasno';

export default component(function HomeView(): Node {
  return h.section(null,
    h.h1(null, 'Chat'),
    h.p(null, 'Pick a room from the list. Rooms with new messages show an unread count.'));
});
