export const corvaDataAPI = {
  get: jest.fn().mockResolvedValue([]),
  post: jest.fn().mockResolvedValue({}),
  put: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
};

export const corvaAPI = {
  get: jest.fn().mockResolvedValue([]),
  post: jest.fn().mockResolvedValue({}),
  put: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
};

export const socketClient = {
  subscribe: jest.fn().mockReturnValue(() => {}),
};
