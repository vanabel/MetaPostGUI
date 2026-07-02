u:=1u;
pair A,B,C,D,X;
A=(-4u,-1u); B=(4u,2u);
C=(-3u,2u); D=(3u,-2u);
X=whatever[A,B]=whatever[C,D];
draw A--B dashed evenly;
draw C--D dashed evenly;
draw A--C--B--D--cycle withpen pencircle scaled .5pt;
dotlabel.top(btex $X$ etex, X);
