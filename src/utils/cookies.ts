import Cookies from 'js-cookie';

const REFRESH_TOKEN_KEY = 'refreshToken';

export const getRefreshToken = (): string | undefined => {
  return Cookies.get(REFRESH_TOKEN_KEY);
};

export const setRefreshToken = (token: string): void => {
  Cookies.set(REFRESH_TOKEN_KEY, token, {
    secure: true,
    sameSite: 'strict',
    expires: 7, // 7 days
  });
};

export const removeRefreshToken = (): void => {
  Cookies.remove(REFRESH_TOKEN_KEY);
};
