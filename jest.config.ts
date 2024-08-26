module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Include other configurations if needed
  testPathIgnorePatterns: [
	  "/node_modules/",
	  "/dist/"
  ]
};
