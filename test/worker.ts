// Minimal worker entry for tests — services are tested directly, not via fetch handler.
export default {
  fetch() {
    return new Response("test worker");
  },
};
