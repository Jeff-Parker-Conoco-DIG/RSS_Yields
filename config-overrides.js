const { getWebpackConfig } = require('@corva/dc-platform-shared/cjs');

module.exports = (env, argv) => {
  const baseConfig = getWebpackConfig(env, argv);

  const isTypeScriptRule = (rule) => {
    if (!rule || !rule.test) return false;
    const testStr = rule.test.toString();
    return testStr.includes('\\.ts') || testStr.includes('.ts');
  };

  const filteredRules = baseConfig.module.rules.filter(rule => {
    if (isTypeScriptRule(rule)) return false;
    if (rule.oneOf) {
      rule.oneOf = rule.oneOf.filter(oneOfRule => !isTypeScriptRule(oneOfRule));
    }
    return true;
  });

  return {
    ...baseConfig,
    module: {
      ...baseConfig.module,
      rules: [
        ...filteredRules,
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                compilerOptions: {
                  noEmit: false,
                  module: 'esnext',
                  jsx: 'react',
                },
              },
            },
          ],
        },
      ],
    },
  };
};