module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\.(js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\.(gif|ttf|eot|svg|png)$': '<rootDir>/test/fileMock.js'
  },
  // setupFilesAfterEnv: ['<rootDir>/test/setup-test.js'],
};