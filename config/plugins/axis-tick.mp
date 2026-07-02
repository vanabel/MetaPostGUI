% 插件附属 MetaPost 源（由 axis-tick.plugin.json 引用）
vardef drawAxisTick(expr len)(text lab) =
  drawarrow ((0,0)--(len,0)) scaled u;
  label(lab, (len*u,0));
enddef;
